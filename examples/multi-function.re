function square(x)
    return x * x
end

function sum_of_squares(a, b)
    return square(a) + square(b)
end

function main()
    result = sum_of_squares(3, 4)
    print(result)
end


