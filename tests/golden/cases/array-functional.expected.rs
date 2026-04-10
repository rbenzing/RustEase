fn main() {
    let numbers: Vec<i32> = vec![1, 2, 3, 4, 5];
    let doubled: Vec<i32> = numbers.iter().map(|x| x * 2).collect::<Vec<_>>();
    println!("{:?}", doubled);
    let evens: Vec<i32> = numbers.iter().filter(|x| x % 2 == 0).cloned().collect::<Vec<_>>();
    println!("{:?}", evens);
    let total: i32 = numbers.iter().fold(0, |acc, x| acc + x);
    println!("{}", total);
    let has_big: bool = numbers.iter().any(|x| x > 3);
    println!("{}", has_big);
    let all_positive: bool = numbers.iter().all(|x| x > 0);
    println!("{}", all_positive);
}

