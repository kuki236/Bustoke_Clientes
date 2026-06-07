import { AuthProvider } from './context/AuthContext'
import LandingPage from './components/LandingPage'

function App() {
  return (
    <AuthProvider>
      <LandingPage />
    </AuthProvider>
  )
}

export default App
