fn fibonacci(n: i32) -> i32 {
    if n <= 1 {
        return n;
    }
    let mut a: i32 = 0;
    let mut b: i32 = 1;
    let mut i: i32 = 2;
    while i <= n {
        let temp: i32 = b;
        b = a + b;
        a = temp;
        i = i + 1;
    }
    return b;
}

fn main() {
    let result: i32 = fibonacci(10);
    println!("{}", result);
}

