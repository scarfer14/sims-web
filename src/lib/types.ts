export type MovementType = 'stock_in' | 'stock_out' | 'sale' | 'return' | 'damage' | 'expired' | 'adjustment';

export interface Me { user_id: string; employee_id: string; name: string; email: string | null }
export interface Category { category_id: string; category_name: string; description: string | null }
export interface Product {
  product_id: string; category_id: string; category_name: string; sku: string; barcode: string | null;
  product_name: string; description: string | null; unit_measurement: 'PCS' | 'KG' | 'L';
  cost_price: number | string; selling_price: number | string; reorder_level: number;
  quantity_on_hand: number; has_movements: boolean;
}
export interface Supplier {
  supplier_id: string; supplier_name: string; contact_name: string | null; email: string | null;
  phone: string | null; address: string | null; is_active: boolean;
}
export interface AppUser { user_id: string; employee_id: string; name: string; email: string | null; is_active: boolean; linked: boolean }
export interface Movement {
  stock_movement_id: string; product_id: string; product_name: string; performed_by: string; user_name: string;
  movement_type: MovementType; quantity_delta: number; reason: string | null; created_at: string;
}
export interface LineItem { product_id: string; product_name: string; quantity: number; total_price: number | string }
export interface PurchaseOrder {
  purchase_order_id: string; supplier_id: string; supplier_name: string; ordered_by_name: string; order_date: string;
  status: 'PENDING' | 'RECEIVED' | 'CANCELLED'; total_amount: number | string;
  items: (LineItem & { unit_cost: number | string })[];
}
export interface Sale {
  sale_id: string; sold_by_name: string; sale_date: string; total_amount: number | string;
  payment_method: 'CASH' | 'CARD' | 'E-WALLET'; items: (LineItem & { unit_price: number | string })[];
}
export interface AppState {
  me: Me; categories: Category[]; products: Product[]; suppliers: Supplier[]; users: AppUser[];
  movements: Movement[]; purchase_orders: PurchaseOrder[]; sales: Sale[];
}
