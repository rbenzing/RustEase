#[derive(Debug, Clone)]
struct Point {
    x: i32,
    y: i32,
}

fn main() {
    let p: Point = Point { x: 10, y: 20 };
    println!("{}", p.x);
}

