fn main() {
    let numbers: Vec<i32> = vec![1, 2, 3, 4, 5];
    let results = numbers.iter().map(|x| { let y = x * 2; y + 1 }).collect::<Vec<_>>();
    println!("{:?}", results);
}

