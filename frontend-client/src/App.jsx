import { Route, Routes } from 'react-router-dom'
import LandingPage from './components/LandingPage'
import ResultsPage from './components/ResultsPage'
import SeatSelectionPage from './components/SeatSelectionPage'
import CheckoutPage from './components/CheckoutPage'
import CheckoutSuccessPage from './components/CheckoutSuccessPage'

function App() {
  return (
    <Routes>
      <Route path="/" element={<LandingPage />} />
      <Route path="/buses" element={<ResultsPage />} />
      <Route path="/viaje/:id_viaje/asientos" element={<SeatSelectionPage />} />
      <Route path="/checkout" element={<CheckoutPage />} />
      <Route path="/checkout/success" element={<CheckoutSuccessPage />} />
    </Routes>
  )
}

export default App
