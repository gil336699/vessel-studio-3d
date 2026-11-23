import { Component, type ReactNode } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { App } from './App'
import './styles.css'

// If the page itself fails, it says so and offers a reload, rather than going blank.
class Guard extends Component<{ children: ReactNode }, { error: string | null }> {
  state = { error: null as string | null }
  static getDerivedStateFromError(error: unknown) { return { error: error instanceof Error ? error.message : String(error) } }
  render() {
    if (!this.state.error) return this.props.children
    return <main className="crashed" role="alert">
      <h1>Vessel Studio 3D stopped</h1>
      <p>Something went wrong: {this.state.error}</p>
      <p>Reload the page to start again. A project you saved can be opened again after the reload.</p>
      <button type="button" className="primary" onClick={() => window.location.reload()}>Reload</button>
    </main>
  }
}

// Reuse the root across hot reloads in development.
const container = document.getElementById('root') as HTMLElement & { __root?: Root }
container.__root ??= createRoot(container)
container.__root.render(<Guard><App /></Guard>)
