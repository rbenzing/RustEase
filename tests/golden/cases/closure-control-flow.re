function main()
    numbers = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
    result = numbers.filter(|x| {
        if x > 5
            return true
        end
        return false
    })
    print(result)
end

