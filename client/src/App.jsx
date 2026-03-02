import { useState } from 'react'
import './App.css'

function App() {
  const API = (import.meta.env && import.meta.env.VITE_API_URL) || 'http://localhost:4002'
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [token, setToken] = useState(sessionStorage.getItem('jwt') || '')
  const [loginStatus, setLoginStatus] = useState('')
  const [restaurants, setRestaurants] = useState([])
  const [selectedRestaurantId, setSelectedRestaurantId] = useState('')
  const [restaurantName, setRestaurantName] = useState('')
  const [images, setImages] = useState([])
  const [previews, setPreviews] = useState([])
  const [ingestStatus, setIngestStatus] = useState(null)
  const [menuItems, setMenuItems] = useState([])
  const [query, setQuery] = useState('')
  const [results, setResults] = useState([])
  const [lastItems, setLastItems] = useState([])
  const [searchStatus, setSearchStatus] = useState('')

  async function onLogin(e) {
    e.preventDefault()
    setLoginStatus('Signing in...')
    try {
      const r = await fetch(`${API}/api/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Login failed')
      sessionStorage.setItem('jwt', j.token)
      setToken(j.token)
      setLoginStatus('Signed in')
    } catch (err) {
      setLoginStatus(err.message || 'Login failed')
    }
  }
  async function onRegister(e) {
    e.preventDefault()
    setLoginStatus('Registering...')
    try {
      const r = await fetch(`${API}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Registration failed')
      setLoginStatus('Registered, now sign in')
    } catch (err) {
      setLoginStatus(err.message || 'Registration failed')
    }
  }

  async function loadRestaurants() {
    const r = await fetch(`${API}/api/restaurants`)
    const j = await r.json()
    setRestaurants(j.restaurants || [])
    if (j.restaurants?.length && !selectedRestaurantId) {
      setSelectedRestaurantId(String(j.restaurants[0].id))
    }
  }

  async function addRestaurant(e) {
    e.preventDefault()
    if (!token) { setLoginStatus('Sign in first'); return }
    if (!restaurantName) return
    try {
      const r = await fetch(`${API}/api/restaurants`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ name: restaurantName }),
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Failed')
      setSelectedRestaurantId(String(j.id))
      setIngestStatus(`Restaurant created: ${j.name}`)
      loadRestaurants()
    } catch (e) {
      setIngestStatus(e.message || 'Failed')
    }
  }

  function onSelectFiles(e) {
    const files = Array.from(e.target.files || [])
    setImages(files)
    const urls = files.map((f) => URL.createObjectURL(f))
    setPreviews(urls)
  }

  async function onIngest(e) {
    e.preventDefault()
    if (!restaurantName || images.length === 0) return
    setIngestStatus('Processing...')
    const fd = new FormData()
    fd.append('restaurantName', restaurantName)
    for (const img of images) fd.append('images', img)
    try {
      const r = await fetch(`${API}/api/ingest`, { method: 'POST', body: fd })
      const j = await r.json()
      if (!r.ok) {
        const msg = j.error ? `Failed: ${j.error}` : 'Failed'
        throw new Error(msg)
      }
      setIngestStatus(`Saved ${j.itemsCount} items`)
      setLastItems(j.itemsPreview || [])
    } catch (err) {
      setIngestStatus(err.message || 'Failed')
    }
  }

  async function uploadToRestaurant(e) {
    e.preventDefault()
    if (!token) { setIngestStatus('Sign in first'); return }
    if (!selectedRestaurantId || images.length === 0) return
    setIngestStatus('Uploading...')
    const fd = new FormData()
    fd.append('image', images[0])
    try {
      const r = await fetch(`${API}/api/restaurants/${selectedRestaurantId}/upload`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: fd,
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.error || 'Failed')
      setIngestStatus(`Image saved, added ${j.added} items`)
      setLastItems(j.itemsPreview || [])
      getMenu()
    } catch (e) {
      setIngestStatus(e.message || 'Failed')
    }
  }

  async function getMenu(e) {
    if (e) e.preventDefault()
    if (!selectedRestaurantId) return
    const r = await fetch(`${API}/api/restaurants/${selectedRestaurantId}/menu`)
    const j = await r.json()
    setMenuItems(j.items || [])
  }

  async function editMenuItem(id) {
    if (!token) { setLoginStatus('Sign in first'); return }
    const current = menuItems.find(m => m.id === id)
    const name = window.prompt('Edit dish name', current?.name || '')
    if (!name) return
    const r = await fetch(`${API}/api/restaurants/${selectedRestaurantId}/menu/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({ name }),
    })
    const j = await r.json()
    if (r.ok) {
      setMenuItems(menuItems.map(m => m.id === id ? j.item : m))
    } else {
      alert(j.error || 'Update failed')
    }
  }

  async function onSearch(e) {
    e.preventDefault()
    setSearchStatus('Searching...')
    try {
      const r = await fetch(`${API}/api/search?query=` + encodeURIComponent(query))
      const j = await r.json()
      const out = j.results || []
      setResults(out)
      setSearchStatus(out.length ? `Found ${out.length} restaurant(s)` : 'No results')
    } catch (e) {
      setSearchStatus('Search failed')
    }
  }

  return (
    <div className="container">
      <h1>Restaurant Menu OCR</h1>
      <section className="panel">
        <h2>Admin Login</h2>
        <form onSubmit={onLogin}>
          <label>
            Username
            <input type="text" value={username} onChange={e => setUsername(e.target.value)} />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} />
          </label>
          <button type="submit">Login</button>
          <button onClick={onRegister} style={{marginLeft:8}}>Register</button>
          {loginStatus && <div className="status">{loginStatus}</div>}
        </form>
      </section>
      <section className="panel">
        <h2>Add Restaurant</h2>
        <form onSubmit={addRestaurant}>
          <label>
            Name
            <input type="text" value={restaurantName} onChange={e => setRestaurantName(e.target.value)} placeholder="e.g., ABC Restaurant" />
          </label>
          <button type="submit">Create</button>
        </form>
        <div style={{marginTop:8}}>
          <button onClick={loadRestaurants}>Load Restaurants</button>
          {restaurants.length > 0 && (
            <select value={selectedRestaurantId} onChange={e => setSelectedRestaurantId(e.target.value)} style={{marginLeft:8}}>
              {restaurants.map(r => <option key={r.id} value={r.id}>{r.name} ({r.id})</option>)}
            </select>
          )}
        </div>
      </section>
      <section className="panel">
        <h2>Upload Menu</h2>
        <form onSubmit={onIngest}>
          <label>
            Restaurant Name
            <input
              type="text"
              value={restaurantName}
              onChange={(e) => setRestaurantName(e.target.value)}
              placeholder="e.g., ABC Restaurant"
              required
            />
          </label>
          <label>
            Take or Upload Photos (JPEG/PNG)
            <input
              type="file"
              accept="image/jpeg,image/png"
              capture="environment"
              multiple
              onChange={onSelectFiles}
            />
          </label>
          <div className="previews">
            {previews.map((src, i) => (
              <img key={i} src={src} alt={'preview-' + i} />
            ))}
          </div>
          <button type="submit">Submit</button>
          {ingestStatus && <div className="status">{ingestStatus}</div>}
          {lastItems.length > 0 && (
            <div className="extracted">
              <div className="extracted-title">Extracted Items (preview)</div>
              <ul>
                {lastItems.map((it, i) => (
                  <li key={i}>{it}</li>
                ))}
              </ul>
            </div>
          )}
        </form>
      </section>
      <section className="panel">
        <h2>Upload Image For Selected Restaurant</h2>
        <form onSubmit={uploadToRestaurant}>
          <div>Selected ID: {selectedRestaurantId || 'None'}</div>
          <label>
            Choose JPEG/PNG
            <input type="file" accept="image/jpeg,image/png" onChange={onSelectFiles} />
          </label>
          <div className="previews">
            {previews.map((src, i) => <img key={i} src={src} alt={'preview-'+i} />)}
          </div>
          <button type="submit">Upload & OCR</button>
        </form>
        {lastItems.length > 0 && (
          <div className="extracted">
            <div className="extracted-title">Extracted Items (preview)</div>
            <ul>
              {lastItems.map((it, i) => <li key={i}>{it}</li>)}
            </ul>
          </div>
        )}
        <div style={{marginTop:8}}>
          <button onClick={getMenu}>Load Menu</button>
        </div>
        {menuItems.length > 0 && (
          <div className="results" style={{marginTop:8}}>
            <div className="result">
              <h3>Menu Items</h3>
              <ul>
                {menuItems.map(m => (
                  <li key={m.id}>
                    {m.name} <button onClick={() => editMenuItem(m.id)} style={{marginLeft:8}}>Edit</button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </section>
      <section className="panel">
        <h2>Search Dishes</h2>
        <form onSubmit={onSearch}>
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="e.g., biryani"
          />
          <button type="submit">Search</button>
        </form>
        {searchStatus && <div className="status muted">{searchStatus}</div>}
        <div className="results">
          {results.map((r) => (
            <div key={r.restaurantName} className="result">
              <h3>{r.restaurantName}</h3>
              <ul>
                {r.items.map((it, i) => (
                  <li key={i}>{it}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}

export default App
