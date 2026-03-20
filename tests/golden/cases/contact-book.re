struct Contact
  name: string
  email: string
  phone: string
end

impl Contact
  function display()
    print(self.name)
    print(self.email)
    print(self.phone)
  end
end

function main()
  c1 = Contact { name: "Alice Smith", email: "alice@example.com", phone: "555-0101" }
  c2 = Contact { name: "Bob Jones", email: "bob@example.com", phone: "555-0102" }
  c3 = Contact { name: "Carol White", email: "carol@example.com", phone: "555-0103" }
  contacts = [c1, c2, c3]
  for contact in contacts
    contact.display()
  end
end

