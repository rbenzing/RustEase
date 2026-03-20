fn square(x: i32) -> i32 {
    return x * x;
}

fn sum_of_squares(a: i32, b: i32) -> i32 {
    return square(a) + square(b);
}

fn main() {
    let result: i32 = sum_of_squares(3, 4);
    println!("{}", result);
}

