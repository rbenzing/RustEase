struct Counter
    value: int
end

impl Counter
    function increment(amount)
        self.value += amount
    end
end

function main()
    c = Counter { value: 0 }
    c.increment(5)
    print(c.value)
end

