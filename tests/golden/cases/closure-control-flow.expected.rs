fn main() {
    let numbers: Vec<i32> = vec![1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
    let result: Vec<i32> = numbers.iter().filter(|x| { if x > 5 { return true; } return false; }).cloned().collect::<Vec<_>>();
    println!("{}", result);
}


