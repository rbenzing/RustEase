fn main() {
    let secret: i32 = 42;
    let mut attempts: i32 = 0;
    println!("{}", String::from("Guess the number (1-100)!"));
    loop {
        let input: String = {
            print!("{}", String::from("Your guess: "));
            std::io::Write::flush(&mut std::io::stdout()).unwrap();
            let mut input = String::new();
            std::io::stdin().read_line(&mut input).unwrap();
            input.trim().to_string()
        };
        let guess: i32 = input.parse::<i32>().unwrap();
        attempts = attempts + 1;
        if guess < secret {
            println!("{}", String::from("Too low!"));
        } else if guess > secret {
            println!("{}", String::from("Too high!"));
        } else {
            println!("Correct! You got it in {} attempts!", attempts);
            break;
        }
    }
}


