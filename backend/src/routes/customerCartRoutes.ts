
import { Router } from 'express';
import { getCart, getMergedCart, addToCart, updateCartItem, removeFromCart, clearCart } from '../modules/customer/controllers/customerCartController';
import { authenticate } from '../middleware/auth';

const router = Router();

router.use(authenticate);

// Must be registered before "/" so it isn't shadowed by the single-channel route
router.get('/merged', getMergedCart);
router.get('/', getCart);
router.post('/add', addToCart);
router.put('/item/:itemId', updateCartItem);
router.delete('/item/:itemId', removeFromCart);
router.delete('/', clearCart);

export default router;
