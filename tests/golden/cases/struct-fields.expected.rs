#[derive(Debug, Clone)]
struct Point {
    x: i32,
    y: i32,
}

fn main() {
    let mut p: Point = Point { x: 1, y: 2 };
    println!("{}", p.x);
    p.x = 10;
    println!("{}", p.x);
}

