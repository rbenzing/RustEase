#[derive(Debug, Clone)]
struct Contact {
    name: String,
    email: String,
    phone: String,
}

impl Contact {
    fn display(&self) {
        println!("{}", self.name);
        println!("{}", self.email);
        println!("{}", self.phone);
    }
}

fn main() {
    let c1: Contact = Contact { name: String::from("Alice Smith"), email: String::from("alice@example.com"), phone: String::from("555-0101") };
    let c2: Contact = Contact { name: String::from("Bob Jones"), email: String::from("bob@example.com"), phone: String::from("555-0102") };
    let c3: Contact = Contact { name: String::from("Carol White"), email: String::from("carol@example.com"), phone: String::from("555-0103") };
    let contacts: Vec<Contact> = vec![c1, c2, c3];
    for contact in &contacts {
        contact.display();
    }
}


