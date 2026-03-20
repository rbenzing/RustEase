enum Category
    Electronics
    Clothing
    Food
    Books
end

struct Item
    name: string
    price: float
    quantity: int
end

impl Item
    function total_value() -> float
        return self.price * float(self.quantity)
    end

    function display()
        print(self.name)
        print(self.price)
        print(self.quantity)
    end
end

function describe_category(cat)
    match cat
        Category.Electronics => print("Category: Electronics")
        Category.Clothing => print("Category: Clothing")
        Category.Food => print("Category: Food")
        Category.Books => print("Category: Books")
    end
end

function main()
    item1 = Item { name: "Laptop", price: 999.99, quantity: 5 }
    item2 = Item { name: "T-Shirt", price: 19.99, quantity: 50 }
    item3 = Item { name: "Rice Bag", price: 5.99, quantity: 100 }
    item4 = Item { name: "Rust Book", price: 39.99, quantity: 25 }
    items = [item1, item2, item3, item4]
    total = 0.0
    for item in items
        item.display()
        total += item.total_value()
    end
    print("Total inventory value:")
    print(total)
    describe_category(Category.Electronics)
    describe_category(Category.Clothing)
    describe_category(Category.Food)
    describe_category(Category.Books)
end

