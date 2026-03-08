import { useDispatch, useSelector } from "react-redux"
import { setQuery, searchDishes } from "../store/slices/searchSlice.js"

export default function SearchPanel() {
  const dispatch = useDispatch()
  const query = useSelector((s) => s.search.query)
  const status = useSelector((s) => s.search.status)
  const results = useSelector((s) => s.search.results)
  function onSearch(e) { e.preventDefault(); dispatch(searchDishes({ query })) }
  return (
    <div className="panel">
      <h2>Search Dishes</h2>
      <form onSubmit={onSearch}>
        <input type="text" value={query} onChange={(e) => dispatch(setQuery(e.target.value))} placeholder="e.g., biryani" />
        <button type="submit">Search</button>
      </form>
      {status && <div className="status muted">{status}</div>}
      <div className="results">
        {results.map((r) => (
          <div key={r.restaurantName} className="result">
            <h3>{r.restaurantName}</h3>
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
                  {r.items.map((it, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}>
                      <td style={{ padding: 8, fontWeight: 500 }}>{it.name}</td>
                      <td style={{ padding: 8, color: '#10b981', fontWeight: 600 }}>{it.price || '—'}</td>
                      <td style={{ padding: 8, fontSize: '0.85rem', opacity: 0.7 }}>{it.description || '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
