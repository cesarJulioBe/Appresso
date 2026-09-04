class Order{
    constructor(id, customer, products, status = 'Requested') {
    this.id = id;
    this.customer = customer;
    this.products = products;
    this.status = status;
    this.createdAt = new Date();
    }

    totalQuantity() {
        let total = 0;
        for (const product of this.products) {
            total += product.quantity;
        }
        return total;
    }

    totalAmount() {
        let total = 0;
        for (const product of this.products) {
            total += product.price * product.quantity;
        }
        return total;
    }

}
module.exports = Order;
