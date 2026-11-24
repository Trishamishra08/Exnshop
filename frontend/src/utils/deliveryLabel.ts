/**
 * Delivery status text for admin order lists. Orders the seller delivers themselves
 * (self delivery / self shipping) and E-commerce courier parcels never get a rider, so
 * they show who handles them instead of "Not Assigned".
 * `deliveredBy` comes from the admin order APIs.
 */
export const deliveryStatusLabel = (order: any): string => {
  if (order?.deliveredBy === 'Seller' || order?.deliveryPreference === 'Self') return 'Seller delivers';
  if (order?.deliveredBy === 'Courier') return 'By courier';
  return order?.deliveryBoyStatus || 'Not Assigned';
};

/** True when an Exnshop delivery partner (rider) is meant to take this order. */
export const needsRider = (order: any): boolean =>
  order?.deliveredBy ? order.deliveredBy === 'Rider' : order?.channel !== 'ECommerce' && order?.deliveryPreference !== 'Self';
