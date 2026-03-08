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
  const lastGuardrail = useSelector((s) => s.menu.lastGuardrail);
  const lastSource = useSelector((s) => s.menu.lastSource);
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
    console.log("[DEBUG] onUpload clicked", { selectedId, file: file?.name });

    if (!token) { setStatus("Sign in first"); return; }
    if (!selectedId) { setStatus("Error: Please select a restaurant first!"); return; }
    if (!file) { setStatus("Error: Please choose a file first!"); return; }

    setStatus("Uploading and analyzing image (this may take up to 20 seconds)...");
    dispatch(uploadImage({ token, id: selectedId, file })).unwrap()
      .then(() => {
        setStatus("Uploaded successfully! Extracted items below.");
        dispatch(fetchMenu({ id: selectedId }));
      })
      .catch((err) => {
        console.error("[UPLOAD ERROR]", err);
        setStatus(`Upload Failed: ${err.message || 'Server Error'}`);
      });
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

          {lastGuardrail && (
            <div className="guardrail-status" style={{
              padding: '12px',
              borderRadius: '8px',
              background: lastGuardrail.needsReview ? 'rgba(239, 68, 68, 0.1)' : 'rgba(16, 185, 129, 0.1)',
              borderLeft: `4px solid ${lastGuardrail.needsReview ? '#ef4444' : '#10b981'}`,
              marginBottom: '16px',
              marginTop: '8px'
            }}>
              <div style={{ fontWeight: 'bold', display: 'flex', justifyContent: 'space-between' }}>
                <span>AI Guardrail Audit Score: {lastGuardrail.score}/10</span>
                <span style={{ fontSize: '0.8rem', opacity: 0.7 }}>Method: {lastSource?.toUpperCase()}</span>
              </div>
              <div style={{ fontSize: '0.9rem', marginTop: '4px' }}>
                {lastGuardrail.needsReview ? `⚠️ ${lastGuardrail.reason || 'Verification recommended.'}` : '✅ Extraction looks highly accurate.'}
              </div>
            </div>
          )}

          <div className="table-container" style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 12 }}>
              <thead>
                <tr style={{ textAlign: 'left', borderBottom: '2px solid rgba(255,255,255,0.1)' }}>
                  <th style={{ padding: 8 }}>Dish Name</th>
                  <th style={{ padding: 8 }}>Price</th>
                  <th style={{ padding: 8 }}>Description</th>
                </tr>
              </thead>
              <tbody>
                {lastPreview.map((it, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                    <td style={{ padding: 8 }}>{it.name}</td>
                    <td style={{ padding: 8, color: '#10b981' }}>{it.price || '—'}</td>
                    <td style={{ padding: 8, fontSize: '0.85rem', opacity: 0.7 }}>{it.description || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
      {menuItems.length > 0 && (
        <div className="results" style={{ marginTop: 20 }}>
          <div className="result" style={{ width: '100%', maxWidth: 'none' }}>
            <h3>Menu Items Table</h3>
            <div className="table-container" style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ textAlign: 'left', borderBottom: '2px solid rgba(255,255,255,0.1)' }}>
                    <th style={{ padding: 8 }}>Dish Name</th>
                    <th style={{ padding: 8 }}>Price</th>
                    <th style={{ padding: 8 }}>Description</th>
                    <th style={{ padding: 8 }}>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {menuItems.map((m) => (
                    <tr key={m.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
                      <td style={{ padding: 8, fontWeight: 500 }}>{m.name}</td>
                      <td style={{ padding: 8, color: '#10b981', fontWeight: 600 }}>{m.price || '—'}</td>
                      <td style={{ padding: 8, fontSize: '0.85rem', opacity: 0.7 }}>{m.description || '—'}</td>
                      <td style={{ padding: 8 }}>
                        <button onClick={() => onEdit(m.id)} style={{ margin: 0, padding: '4px 8px', fontSize: '0.8rem' }}>Edit</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
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
