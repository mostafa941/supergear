import { payment } from '../assets'
import Container from './Container'
import TopFooter from './TopFooter'

function Footer() {
  return (
    <div className='mt-10 '>
      <TopFooter/>
      <Container className='flex flex-col md:flex-row items-center gap-4 justify-between'>
        <p>@2026 Supergear. All rights reserved.</p>
        <img src={payment} alt="payment-img" className='object-cover' />
      </Container>

    </div>
  )
}

export default Footer