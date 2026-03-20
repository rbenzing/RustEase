#[derive(Debug, Clone)]
struct Circle {
    radius: f64,
}

impl Circle {
    fn area(&self) -> f64 {
        return 3.14159 * self.radius * self.radius;
    }

    fn scale(&mut self, factor: f64) {
        self.radius = self.radius * factor;
    }
}

fn main() {
    let mut c: Circle = Circle { radius: 5.0 };
    let a: f64 = c.area();
    println!("{}", a);
    c.scale(2.0);
    let a2: f64 = c.area();
    println!("{}", a2);
}


