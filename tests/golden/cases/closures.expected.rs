fn main() {
    let double = |x| x * 2;
    let result: i32 = double(5);
    println!("{}", result);
    let add = |a, b| a + b;
    let sum: i32 = add(3, 4);
    println!("{}", sum);
}
