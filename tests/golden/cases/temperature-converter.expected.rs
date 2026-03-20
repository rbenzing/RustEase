fn celsius_to_fahrenheit(c: f64) -> f64 {
    return c * 9.0 / 5.0 + 32.0;
}

fn fahrenheit_to_celsius(f: f64) -> f64 {
    return (f - 32.0) * 5.0 / 9.0;
}

fn celsius_to_kelvin(c: f64) -> f64 {
    return c + 273.15;
}

fn main() {
    let temp_c: f64 = 100.0;
    let f: f64 = celsius_to_fahrenheit(temp_c);
    println!("100C = {}F", f);
    let temp_f: f64 = 72.0;
    let c: f64 = fahrenheit_to_celsius(temp_f);
    println!("72F = {}C", c);
    let k: f64 = celsius_to_kelvin(temp_c);
    println!("100C = {}K", k);
}


