import { AuthGate } from './components/AuthGate'
import { Workbench } from './components/Workbench'

export function App() {
  return (
    <AuthGate>
      <Workbench />
    </AuthGate>
  )
}
