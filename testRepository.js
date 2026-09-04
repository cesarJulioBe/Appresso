const orderRepository = require('./src/infrastructure/database/orderRepository');

async function main() {
  const created = await orderRepository.create("Ana", [
    { name: "Coffee", quantity: 2, price: 5000 }
  ]);
  console.log("Pedido creado:", created);

  const found = await orderRepository.findById(created.id);
  console.log("Pedido encontrado:", found);
  console.log("Total a pagar:", found.totalAmount());

  const all = await orderRepository.findAll();
  console.log("Total de pedidos en la base:", all.length);

  process.exit(0);
}

main();