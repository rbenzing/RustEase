#[derive(Debug, Clone, PartialEq)]
enum Color {
    Red,
    Green,
    Blue,
}

fn main() {
    let c: Color = Color::Red;
    println!("{:?}", c);
    if c == Color::Red {
        println!("{}", String::from("It is red!"));
    }
}

