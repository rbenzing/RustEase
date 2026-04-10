#[derive(Debug, Clone)]
struct Counter {
    value: i32,
}

impl Counter {
    fn increment(&mut self, amount: i32) {
        self.value = self.value + amount;
    }
}

fn main() {
    let mut c: Counter = Counter { value: 0 };
    c.increment(5);
    println!("{}", c.value);
}


