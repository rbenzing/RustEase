#[derive(Debug, Clone, PartialEq)]
enum Operation {
    Add,
    Subtract,
    Multiply,
    Divide,
}

fn calculate(a: f64, b: f64, op: Operation) -> f64 {
    match op {
        Operation::Add => {
            return a + b;
        }
        Operation::Subtract => {
            return a - b;
        }
        Operation::Multiply => {
            return a * b;
        }
        Operation::Divide => {
            return a / b;
        }
    }
}

fn main() {
    let mut result: f64 = calculate(10.0, 3.0, Operation::Add);
    println!("10 + 3 = {}", result);
    result = calculate(10.0, 3.0, Operation::Subtract);
    println!("10 - 3 = {}", result);
    result = calculate(10.0, 3.0, Operation::Multiply);
    println!("10 * 3 = {}", result);
    result = calculate(10.0, 3.0, Operation::Divide);
    println!("10 / 3 = {}", result);
}


