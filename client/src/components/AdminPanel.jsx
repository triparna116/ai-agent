import { useDispatch, useSelector } from "react-redux";
import { createRestaurant, fetchRestaurants, setSelectedId } from "../store/slices/restaurantsSlice.js";
import { fetchMenu, uploadImage, updateMenuItem } from "../store/slices/menuSlice.js";
import { useEffect, useState } from "react";

export default function AdminPanel() {
  const dispatch = useDispatch();
  const token = useSelector((s) => s.auth.token);
  const restaurants = useSelector((s) => s.restaurants.items);
  const selectedId = useSelector((s) => s.restaurants.selectedId);
  const menuItems = useSelector((s) => s.menu.items);
  const images = useSelector((s) => s.menu.images);
  const lastPreview = useSelector((s) => s.menu.lastPreview);
  const [name, setName] = useState("");
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState("");

  useEffect(() => { dispatch(fetchRestaurants()); }, [dispatch]);
  useEffect(() => { if (selectedId) dispatch(fetchMenu({ id: selectedId })); }, [dispatch, selectedId]);

  function onCreate(e) {
    e.preventDefault();
    if (!token) { setStatus("Sign in first"); return; }
    if (!name) return;
    dispatch(createRestaurant({ token, name })).unwrap()
      .then(() => setStatus("Restaurant created"))
      .catch((err) => setStatus(err.message || "Failed"));
  }

  function onUpload(e) {
    e.preventDefault();
    if (!token) { setStatus("Sign in first"); return; }
    if (!selectedId || !file) return;
    setStatus("Uploading and analyzing image (this may take up to 20 seconds)...");
    dispatch(uploadImage({ token, id: selectedId, file })).unwrap()
      .then(() => {
        setStatus("Uploaded successfully! Extracted items below.");
        dispatch(fetchMenu({ id: selectedId }));
      })
      .catch((err) => setStatus(err.message || "Failed"));
  }

  function onEdit(id) {
    const item = menuItems.find((m) => m.id === id);
    if (!item) return;
    const newName = window.prompt("Edit dish name", item.name || "");
    const newPrice = window.prompt("Edit price", item.price || "");
    const newDesc = window.prompt("Edit description", item.description || "");

    if (newName === null && newPrice === null && newDesc === null) return;

    dispatch(updateMenuItem({
      token,
      id: selectedId,
      menuId: id,
      updates: {
        name: newName ?? item.name,
        price: newPrice ?? item.price,
        description: newDesc ?? item.description
      }
    }));
  }

  return (
    <div className="panel">
      <h2>Admin</h2>
      <form onSubmit={onCreate}>
        <label>Name<input type="text" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <button type="submit">Create</button>
      </form>
      <div style={{ marginTop: 8 }}>
        <button onClick={() => dispatch(fetchRestaurants())}>Load Restaurants</button>
        {restaurants.length > 0 && (
          <select value={selectedId} onChange={(e) => dispatch(setSelectedId(e.target.value))} style={{ marginLeft: 8 }}>
            {restaurants.map((r) => <option key={r.id} value={r.id}>{r.name} ({r.id})</option>)}
          </select>
        )}
      </div>

      <form onSubmit={onUpload} style={{ marginTop: 12 }}>
        <div>Selected ID: {selectedId || "None"}</div>
        <label>Choose JPEG/PNG<input type="file" accept="image/jpeg,image/png" onChange={(e) => setFile(e.target.files?.[0] || null)} /></label>
        <button type="submit">Upload & OCR</button>
      </form>
      {status && <div className="status">{status}</div>}
      {file && (
        <div className="previews" style={{ marginTop: 8 }}>
          <div>Local Preview</div>
          <img src={URL.createObjectURL(file)} alt="local-preview" />
        </div>
      )}
      {lastPreview.length > 0 && (
        <div className="extracted">
          <div className="extracted-title">Extracted Items (AI Preview)</div>
          <ul style={{ listStyle: 'none', padding: 0 }}>
            {lastPreview.map((it, i) => (
              <li key={i} style={{ marginBottom: 12, borderBottom: '1px solid rgba(255,255,255,0.05)', paddingBottom: 8 }}>
                <strong>{it.name}</strong> - <span style={{ color: '#10b981' }}>{it.price || 'N/A'}</span>
                {it.description && <p style={{ margin: '4px 0 0 0', fontSize: '0.9rem', opacity: 0.7 }}>{it.description}</p>}
              </li>
            ))}
          </ul>
        </div>
      )}
      {menuItems.length > 0 && (
        <div className="results" style={{ marginTop: 8 }}>
          <div className="result">
            <h3>Menu Items</h3>
            <ul style={{ listStyle: 'none', padding: 0 }}>
              {menuItems.map((m) => (
                <li key={m.id} style={{ marginBottom: 16, borderBottom: '1px solid rgba(255,255,255,0.1)', paddingBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
                    <div>
                      <strong>{m.name}</strong>
                      <div style={{ color: '#10b981', fontWeight: 600 }}>{m.price || 'N/A'}</div>
                    </div>
                    <button onClick={() => onEdit(m.id)} style={{ margin: 0, padding: '4px 8px', fontSize: '0.8rem' }}>Edit</button>
                  </div>
                  {m.description && <p style={{ margin: '8px 0 0 0', fontSize: '0.9rem', opacity: 0.7 }}>{m.description}</p>}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}
      {images && images.length > 0 && (
        <div className="results" style={{ marginTop: 8 }}>
          <div className="result">
            <h3>Uploaded Images</h3>
            <div className="previews">
              {images.map((img, i) => (
                <img key={i} src={img.url || img} alt={'uploaded-' + i} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
