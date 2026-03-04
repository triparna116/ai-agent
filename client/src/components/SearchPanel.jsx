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
            <ul>{r.items.map((it, i) => (<li key={i}>{it}</li>))}</ul>
          </div>
        ))}
      </div>
    </div>
  )
}
