fn add(a: i32, b: i32) -> i32 {
    return a + b;
}

fn main() {
    let x: i32 = 10;
    let y: i32 = 3;
    let sum: i32 = add(x, y);
    println!("{}", sum);
}

