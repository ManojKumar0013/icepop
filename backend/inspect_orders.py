import asyncio
from core.db import SessionLocal
from core.models import Order, OrderItem, Product, User
from sqlalchemy import select

async def main():
    async with SessionLocal() as db:
        orders = (await db.execute(select(Order))).scalars().all()
        print(f"Total orders: {len(orders)}")
        for o in orders:
            items = (await db.execute(select(OrderItem).where(OrderItem.order_id == o.id))).scalars().all()
            item_names = [f"{it.product_name} (prod_id={it.product_id})" for it in items]
            print(f"Order #{o.id} ({o.order_number}): status={o.status}, user_id={o.user_id}, items={item_names}")

        products = (await db.execute(select(Product))).scalars().all()
        print(f"Total products: {len(products)}")
        for p in products:
            print(f"Product {p.id}: {p.name} (slug={p.slug})")

if __name__ == "__main__":
    asyncio.run(main())
