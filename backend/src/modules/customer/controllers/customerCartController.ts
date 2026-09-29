
import { Request, Response } from 'express';
import Cart from '../../../models/Cart';
import CartItem from '../../../models/CartItem';
import Product from '../../../models/Product';
import { findSellersWithinRange } from '../../../utils/locationHelper';
import mongoose from 'mongoose';
import AppSettings from '../../../models/AppSettings';
import { getRoadDistances } from '../../../services/mapService';
import Seller from '../../../models/Seller';
import { resolveSellerChannel } from '../../../utils/commerceChannelHelper';

// Resolve the active commerce channel from query (GET) or body (mutations), defaulting to "Quick"
const getChannel = (req: Request): 'Quick' | 'ECommerce' => {
    const raw = (req.body?.channel || req.query?.channel || 'Quick') as string;
    return raw === 'ECommerce' ? 'ECommerce' : 'Quick';
};

// Helper to calculate item price matching frontend logic
const calculateItemPrice = (product: any, variationSelector: any) => {
    let variation = null;
    let variationId = variationSelector;

    // Handle if variationSelector is an object (some implementations store it differently)
    if (variationSelector && typeof variationSelector === 'object' && variationSelector._id) {
        variationId = variationSelector._id;
    }

    if (variationId && product.variations?.length) {
        variation = product.variations.find((v: any) =>
            (v._id && v._id.toString() === variationId.toString()) ||
            (v.id && v.id === variationId)
        );
    }

    let finalPrice = variation?.price || product.price || 0;

    // Priority: Variation Discount -> Product Discount -> Variation Price -> Product Price
    if (variation?.discPrice && variation.discPrice > 0) {
        finalPrice = variation.discPrice;
    } else if (product.discPrice && product.discPrice > 0) {
        finalPrice = product.discPrice;
    }

    return finalPrice;
};

// Helper to calculate cart total with location filtering
// nearbySellerIds: null means "don't location-filter" (used for E-commerce carts,
// which aren't rider-serviceability-gated); an array means only include items
// from those sellers (used for Quick carts).
const calculateCartTotal = async (cartId: any, nearbySellerIds: mongoose.Types.ObjectId[] | null = []) => {
    const items = await CartItem.find({ cart: cartId }).populate({
        path: 'product',
        select: 'price discPrice variations seller status publish productName'
    });

    let total = 0;
    for (const item of items) {
        const product = item.product as any;
        if (product && product.status === 'Active' && product.publish) {
            const isAvailable = nearbySellerIds === null
                ? true
                : nearbySellerIds.some(id => id.toString() === product.seller.toString());
            if (isAvailable) {
                const price = calculateItemPrice(product, item.variation);
                total += price * item.quantity;
            }
        }
    }
    return total;
};

// Helper to calculate delivery fee.
// channel 'ECommerce' never incurs a rider delivery fee — those items ship via
// the standard courier flow instead, which has no per-order rider payout.
const calculateDeliveryStuff = async (total: number, items: any[], userLat: number | null, userLng: number | null, deliveryOption: string = 'Standard', channel: 'Quick' | 'ECommerce' = 'Quick') => {
    let estimatedDeliveryFee = 0;
    let platformFee = 0;
    let freeDeliveryThreshold = 0;
    let minimumOrderValue = 0;
    let estimatedDistanceKm: number | null = null;

    try {
        const settings = await AppSettings.findOne();
        platformFee = settings?.platformFee ?? 2;
        freeDeliveryThreshold = settings?.freeDeliveryThreshold ?? 199;
        minimumOrderValue = settings?.minimumOrderValue ?? 0;

        if (channel === 'ECommerce') {
            // No rider fee for E-commerce — ships via courier separately.
            estimatedDeliveryFee = 0;
        }
        // Standard Delivery: Always Fixed Price, waived above the free-delivery
        // threshold. This waiver is Standard-only — Instant is a premium,
        // rider-dispatched service and always carries its own distance-based
        // fee below, regardless of cart value.
        else if (deliveryOption === 'Standard') {
            estimatedDeliveryFee = (freeDeliveryThreshold > 0 && total >= freeDeliveryThreshold)
                ? 0
                : (settings?.deliveryCharges ?? 0);
        }
        // Instant Delivery: Distance Based (if config exists)
        else if (deliveryOption === 'Instant' && settings?.deliveryConfig) {
            const config = settings.deliveryConfig;
            // Default to base charge
            estimatedDeliveryFee = config.baseCharge || 0;

            if (userLat && userLng) {
                // Get all sellers involved in the cart
                const sellerIds = new Set<string>();
                items.forEach((item: any) => {
                    if (item.product?.seller) {
                        sellerIds.add(item.product.seller.toString());
                    }
                });

                if (sellerIds.size > 0) {
                    const uniqueSellerIds = Array.from(sellerIds).map(id => new mongoose.Types.ObjectId(id));
                    const sellers = await Seller.find({ _id: { $in: uniqueSellerIds } }).select('location latitude longitude');

                    const sellerLocations: { lat: number; lng: number }[] = [];
                    sellers.forEach(seller => {
                        let lat, lng;
                        if (seller.location?.coordinates?.length === 2) {
                            lng = seller.location.coordinates[0];
                            lat = seller.location.coordinates[1];
                        } else if (seller.latitude && seller.longitude) {
                            lat = parseFloat(seller.latitude);
                            lng = parseFloat(seller.longitude);
                        }
                        if (lat && lng) sellerLocations.push({ lat, lng });
                    });

                    if (sellerLocations.length > 0) {
                        const distances = await getRoadDistances(
                            sellerLocations,
                            { lat: userLat, lng: userLng },
                            config.googleMapsKey
                        );

                        if (distances && distances.length > 0) {
                            const maxDistance = Math.max(...distances);
                            estimatedDistanceKm = Number(maxDistance.toFixed(1));
                            const extraKm = Math.max(0, maxDistance - config.baseDistance);
                            estimatedDeliveryFee = Math.ceil(config.baseCharge + (extraKm * config.kmRate));
                        }
                    }
                }
            }
        } else {
            // Fallback for unknown options
            estimatedDeliveryFee = settings?.deliveryCharges ?? 40;
        }
    } catch (err) {
        console.error("Error calculating delivery stuff:", err);
    }
    return {
        estimatedDeliveryFee,
        estimatedDistanceKm,
        platformFee,
        freeDeliveryThreshold,
        minimumOrderValue,
    };
};

// Builds the cart response payload for one channel — shared by getCart (single
// channel, as requested by the client param) and getMergedCart (both channels
// at once, for the unified Quick + E-commerce cart/checkout experience).
const buildCartResponseData = async (
    userId: string | undefined,
    channel: 'Quick' | 'ECommerce',
    userLat: number | null,
    userLng: number | null,
    deliveryOption: string
) => {
    let nearbySellerIds: mongoose.Types.ObjectId[] = [];
    const hasValidLocation = userLat !== null && userLng !== null && !isNaN(userLat) && !isNaN(userLng);

    if (hasValidLocation) {
        nearbySellerIds = await findSellersWithinRange(userLat, userLng);
    }

    let cart = await Cart.findOne({ customer: userId, channel }).populate({
        path: 'items',
        populate: {
            path: 'product',
            select: 'productName price mainImage stock pack mrp category seller status publish discPrice variations'
        }
    });

    if (!cart) {
        cart = await Cart.create({ customer: userId, channel, items: [], total: 0 });
        return { ...cart.toObject(), items: [], unavailableItems: [], total: 0, instantDeliveryAvailable: true };
    }

    // Filter items based on location availability (Quick only — E-commerce
    // items aren't rider-serviceability-gated) and update total
    const filteredItems: any[] = [];
    const unavailableItems: any[] = [];
    let total = 0;

    for (const item of (cart.items as any)) {
        const product = item.product;
        if (product && product.status === 'Active' && product.publish) {
            // If no location provided, or this is an E-commerce cart, include all items
            if (!hasValidLocation || channel === 'ECommerce') {
                filteredItems.push(item);
                const price = calculateItemPrice(product, item.variation);
                total += price * item.quantity;
            } else {
                // Check if available at location
                const isAvailable = nearbySellerIds.some(id => id.toString() === product.seller.toString());
                if (isAvailable) {
                    filteredItems.push(item);
                    const price = calculateItemPrice(product, item.variation);
                    total += price * item.quantity;
                } else {
                    unavailableItems.push(item);
                }
            }
        }
    }

    // Update cart total in DB if it changed
    if (cart.total !== total) {
        cart.total = total;
        await cart.save();
    }

    // Calculate fees
    const fees = await calculateDeliveryStuff(total, filteredItems, userLat, userLng, deliveryOption, channel);

    // Instant/Quick delivery is only offered if every seller with items in the
    // cart has it enabled (admin-controlled per seller). If any one of them
    // doesn't, only Standard delivery is available for this cart. (Never
    // relevant for E-commerce, which has no rider delivery at all.)
    let instantDeliveryAvailable = true;
    if (channel === 'Quick') {
        const cartSellerIds = new Set<string>();
        filteredItems.forEach((item: any) => {
            if (item.product?.seller) cartSellerIds.add(item.product.seller.toString());
        });
        if (cartSellerIds.size > 0) {
            const sellersInCart = await Seller.find({ _id: { $in: Array.from(cartSellerIds) } }).select('supportsInstantDelivery');
            instantDeliveryAvailable = sellersInCart.every((s: any) => s.supportsInstantDelivery !== false);
        }
    }

    return {
        ...cart.toObject(),
        items: filteredItems,
        unavailableItems,
        total,
        instantDeliveryAvailable,
        ...fees
    };
};

// Get current user's cart (single channel — legacy/still used where only one
// channel's cart is needed)
export const getCart = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { latitude, longitude } = req.query;
        const channel = getChannel(req);

        const userLat = latitude ? parseFloat(latitude as string) : null;
        const userLng = longitude ? parseFloat(longitude as string) : null;
        const deliveryOption = (req.query.deliveryOption as string) || 'Standard';

        const data = await buildCartResponseData(userId, channel, userLat, userLng, deliveryOption);

        return res.status(200).json({ success: true, data });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: 'Error fetching cart',
            error: error.message
        });
    }
};

// Get both channel carts together — powers the unified cart/checkout UI where
// a customer can have Quick and E-commerce items at the same time.
export const getMergedCart = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { latitude, longitude } = req.query;

        const userLat = latitude ? parseFloat(latitude as string) : null;
        const userLng = longitude ? parseFloat(longitude as string) : null;
        const deliveryOption = (req.query.deliveryOption as string) || 'Standard';

        const [quick, ecommerce] = await Promise.all([
            buildCartResponseData(userId, 'Quick', userLat, userLng, deliveryOption),
            buildCartResponseData(userId, 'ECommerce', userLat, userLng, 'Standard'),
        ]);

        return res.status(200).json({
            success: true,
            data: {
                quick,
                ecommerce,
                combinedTotal: (quick.total || 0) + (ecommerce.total || 0),
            }
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: 'Error fetching merged cart',
            error: error.message
        });
    }
};

// Add item to cart
export const addToCart = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { productId, quantity = 1, variation } = req.body;
        const { latitude, longitude } = req.query;

        if (!productId) {
            return res.status(400).json({ success: false, message: 'Product ID is required' });
        }

        // Parse location
        const userLat = latitude ? parseFloat(latitude as string) : null;
        const userLng = longitude ? parseFloat(longitude as string) : null;
        const hasLocation = userLat !== null && userLng !== null && !isNaN(userLat) && !isNaN(userLng);

        // Verify product exists and is available at location
        const product = await Product.findOne({ _id: productId, status: 'Active', publish: true }).populate('seller');
        if (!product) {
            return res.status(404).json({ success: false, message: 'Product not found or unavailable' });
        }

        // Check if seller's shop is open
        const seller = product.seller as any;
        if (seller && seller.isShopOpen === false) {
            return res.status(400).json({
                success: false,
                message: 'Seller is not available at this moment'
            });
        }

        // The cart a product belongs to is derived from ITS seller's channel(s),
        // not a client-supplied param — this is what lets a customer add both
        // Quick and E-commerce products in the same shopping session without
        // manually switching a "mode". A seller enabled for both channels
        // defaults to the Quick cart.
        const channel: 'Quick' | 'ECommerce' = resolveSellerChannel(seller?.channels);

        // Quick items are rider-delivered and therefore require a serviceable
        // location; E-commerce items ship nationally via courier and don't.
        let nearbySellerIds: mongoose.Types.ObjectId[] = [];
        if (channel === 'Quick') {
            if (!hasLocation) {
                return res.status(400).json({
                    success: false,
                    message: 'Location is required to add items to cart'
                });
            }

            nearbySellerIds = await findSellersWithinRange(userLat as number, userLng as number);
            const isAvailable = nearbySellerIds.some(id => id.toString() === (seller._id || seller).toString());

            if (!isAvailable) {
                return res.status(403).json({
                    success: false,
                    message: 'This service is not available in your location yet.'
                });
            }
        }

        // Get or create cart (scoped to the resolved commerce channel)
        let cart = await Cart.findOne({ customer: userId, channel });
        if (!cart) {
            cart = await Cart.create({ customer: userId, channel, items: [], total: 0 });
        }

        // Check if item already exists in cart
        let cartItem = await CartItem.findOne({
            cart: cart._id,
            product: productId,
            variation: variation || null
        });

        if (cartItem) {
            // Update quantity
            cartItem.quantity += quantity;
            await cartItem.save();
        } else {
            // Create new cart item
            cartItem = await CartItem.create({
                cart: cart._id,
                product: productId,
                quantity,
                variation
            });
            cart.items.push(cartItem._id as any);
        }

        // Update total with location filtering (Quick only — ECommerce carts aren't
        // location-gated, see calculateCartTotal's nearbySellerIds contract)
        cart.total = await calculateCartTotal(cart._id, channel === 'Quick' ? nearbySellerIds : null);
        await cart.save();

        // Return updated cart with filtering
        const updatedCart = await Cart.findById(cart._id).populate({
            path: 'items',
            populate: {
                path: 'product',
                select: 'productName price mainImage stock pack mrp category seller status publish discPrice variations'
            }
        });

        const filteredItems = (updatedCart?.items as any[] || []).filter(item => {
            const prod = item.product;
            if (!prod) return false;
            return channel === 'Quick'
                ? nearbySellerIds.some(id => id.toString() === prod.seller.toString())
                : true;
        });

        // Calculate fees
        const deliveryOption = (req.body.deliveryOption as string) || (req.query.deliveryOption as string) || 'Standard';
        const fees = await calculateDeliveryStuff(cart.total, filteredItems, userLat, userLng, deliveryOption, channel);

        return res.status(200).json({
            success: true,
            message: 'Item added to cart',
            data: {
                ...updatedCart?.toObject(),
                items: filteredItems,
                total: cart.total,
                ...fees
            }
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: 'Error adding to cart',
            error: error.message
        });
    }
};

// Update item quantity
export const updateCartItem = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { itemId } = req.params;
        const { quantity } = req.body;
        const { latitude, longitude } = req.query;
        const channel = getChannel(req);

        if (quantity < 1) {
            return res.status(400).json({ success: false, message: 'Quantity must be at least 1' });
        }

        // Parse location
        const userLat = latitude ? parseFloat(latitude as string) : null;
        const userLng = longitude ? parseFloat(longitude as string) : null;
        const hasLocation = userLat !== null && userLng !== null && !isNaN(userLat) && !isNaN(userLng);

        if (channel === 'Quick' && !hasLocation) {
            return res.status(400).json({
                success: false,
                message: 'Location is required to update cart'
            });
        }

        const nearbySellerIds = channel === 'Quick' ? await findSellersWithinRange(userLat as number, userLng as number) : [];

        const cart = await Cart.findOne({ customer: userId, channel });
        if (!cart) {
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }

        const cartItem = await CartItem.findOne({ _id: itemId, cart: cart._id }).populate('product');
        if (!cartItem) {
            return res.status(404).json({ success: false, message: 'Item not found in cart' });
        }

        // Verify item is still available at location (Quick only)
        if (channel === 'Quick') {
            const product = cartItem.product as any;
            const isAvailable = product && nearbySellerIds.some(id => id.toString() === product.seller.toString());

            if (!isAvailable) {
                return res.status(403).json({
                    success: false,
                    message: 'This service is not available in your location yet.'
                });
            }
        }

        cartItem.quantity = quantity;
        await cartItem.save();

        cart.total = await calculateCartTotal(cart._id, channel === 'Quick' ? nearbySellerIds : null);
        await cart.save();

        const updatedCart = await Cart.findById(cart._id).populate({
            path: 'items',
            populate: {
                path: 'product',
                select: 'productName price mainImage stock pack mrp category seller status publish discPrice variations'
            }
        });

        const filteredItems = (updatedCart?.items as any[] || []).filter(item => {
            const prod = item.product;
            if (!prod) return false;
            return channel === 'Quick'
                ? nearbySellerIds.some(id => id.toString() === prod.seller.toString())
                : true;
        });

        // Calculate fees
        const deliveryOption = (req.body.deliveryOption as string) || (req.query.deliveryOption as string) || 'Standard';
        const fees = await calculateDeliveryStuff(cart.total, filteredItems, userLat, userLng, deliveryOption, channel);

        return res.status(200).json({
            success: true,
            message: 'Cart updated',
            data: {
                ...updatedCart?.toObject(),
                items: filteredItems,
                total: cart.total,
                ...fees
            }
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: 'Error updating cart item',
            error: error.message
        });
    }
};

// Remove item from cart
export const removeFromCart = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        const { itemId } = req.params;
        const { latitude, longitude } = req.query;
        const channel = getChannel(req);

        // Parse location
        const userLat = latitude ? parseFloat(latitude as string) : null;
        const userLng = longitude ? parseFloat(longitude as string) : null;

        const cart = await Cart.findOne({ customer: userId, channel });
        if (!cart) {
            return res.status(404).json({ success: false, message: 'Cart not found' });
        }

        await CartItem.findOneAndDelete({ _id: itemId, cart: cart._id });

        // Remove from cart array
        cart.items = cart.items.filter(id => id.toString() !== itemId);

        // Calculate total with location if provided
        let nearbySellerIds: mongoose.Types.ObjectId[] = [];
        if (userLat !== null && userLng !== null && !isNaN(userLat) && !isNaN(userLng)) {
            nearbySellerIds = await findSellersWithinRange(userLat, userLng);
        }

        cart.total = await calculateCartTotal(cart._id, nearbySellerIds);
        await cart.save();

        const updatedCart = await Cart.findById(cart._id).populate({
            path: 'items',
            populate: {
                path: 'product',
                select: 'productName price mainImage stock pack mrp category seller status publish discPrice variations'
            }
        });

        const filteredItems = (updatedCart?.items as any[] || []).filter(item => {
            const prod = item.product;
            if (nearbySellerIds.length > 0) {
                return prod && nearbySellerIds.some(id => id.toString() === prod.seller.toString());
            }
            return true; // If no location provided for removal, just return all (though getCart will filter)
        });

        // Calculate fees
        const deliveryOption = (req.query.deliveryOption as string) || 'Standard';
        const fees = await calculateDeliveryStuff(cart.total, filteredItems, userLat, userLng, deliveryOption, channel);

        return res.status(200).json({
            success: true,
            message: 'Item removed from cart',
            data: {
                ...updatedCart?.toObject(),
                items: filteredItems,
                total: cart.total,
                ...fees
            }
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: 'Error removing from cart',
            error: error.message
        });
    }
};

// Clear cart
export const clearCart = async (req: Request, res: Response) => {
    try {
        const userId = req.user?.userId;
        const channel = getChannel(req);
        const cart = await Cart.findOne({ customer: userId, channel });

        if (cart) {
            await CartItem.deleteMany({ cart: cart._id });
            cart.items = [];
            cart.total = 0;
            await cart.save();
        }

        return res.status(200).json({
            success: true,
            message: 'Cart cleared',
            data: { items: [], total: 0 }
        });
    } catch (error: any) {
        return res.status(500).json({
            success: false,
            message: 'Error clearing cart',
            error: error.message
        });
    }
};
