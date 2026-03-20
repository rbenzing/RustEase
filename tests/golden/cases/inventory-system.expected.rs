#[derive(Debug, Clone)]
struct Item {
    name: String,
    price: f64,
    quantity: i32,
}

#[derive(Debug, Clone, PartialEq)]
enum Category {
    Electronics,
    Clothing,
    Food,
    Books,
}

impl Item {
    fn total_value(&self) -> f64 {
        return self.price * self.quantity as f64;
    }

    fn display(&self) {
        println!("{}", self.name);
        println!("{}", self.price);
        println!("{}", self.quantity);
    }
}

fn describe_category(cat: Category) {
    match cat {
        Category::Electronics => {
            println!("{}", String::from("Category: Electronics"));
        }
        Category::Clothing => {
            println!("{}", String::from("Category: Clothing"));
        }
        Category::Food => {
            println!("{}", String::from("Category: Food"));
        }
        Category::Books => {
            println!("{}", String::from("Category: Books"));
        }
    }
}

fn main() {
    let item1: Item = Item { name: String::from("Laptop"), price: 999.99, quantity: 5 };
    let item2: Item = Item { name: String::from("T-Shirt"), price: 19.99, quantity: 50 };
    let item3: Item = Item { name: String::from("Rice Bag"), price: 5.99, quantity: 100 };
    let item4: Item = Item { name: String::from("Rust Book"), price: 39.99, quantity: 25 };
    let items: Vec<Item> = vec![item1, item2, item3, item4];
    let mut total: f64 = 0.0;
    for item in &items {
        item.display();
        total = total + item.total_value();
    }
    println!("{}", String::from("Total inventory value:"));
    println!("{}", total);
    describe_category(Category::Electronics);
    describe_category(Category::Clothing);
    describe_category(Category::Food);
    describe_category(Category::Books);
}



