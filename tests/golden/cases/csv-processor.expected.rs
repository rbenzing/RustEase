fn main() {
    let csv_data: String = String::from("name,quantity,price\nWidget,10,5.99\nGadget,5,12.50\nDoohickey,20,3.25");
    std::fs::write(String::from("sales.csv"), csv_data).unwrap();
    println!("{}", String::from("CSV file written: sales.csv"));
    let content: String = std::fs::read_to_string(String::from("sales.csv")).unwrap();
    let rows: Vec<String> = content.split(String::from("\n").as_str()).map(|s| s.to_string()).collect::<Vec<String>>();
    println!("{}", String::from("=== Sales Report ==="));
    let mut grand_total: f64 = 0.0;
    let mut row_num: i32 = 0;
    for row in &rows {
        if row_num > 0 {
            let fields: Vec<String> = row.split(String::from(",").as_str()).map(|s| s.to_string()).collect::<Vec<String>>();
            let name: String = fields[0 as usize];
            let qty: i32 = fields[1 as usize].parse::<i32>().unwrap();
            let price: f64 = fields[2 as usize].parse::<f64>().unwrap();
            let revenue: f64 = qty as f64 * price;
            grand_total = grand_total + revenue;
            println!("{}: {} units at {} = {}", name, qty, price, revenue);
        }
        row_num = row_num + 1;
    }
    println!("Grand total revenue: {}", grand_total);
    let summary: String = format!("Total revenue: {}", grand_total);
    std::fs::write(String::from("summary.txt"), summary).unwrap();
    println!("{}", String::from("Summary written to summary.txt"));
}

