function fibonacci(n)
if n <= 1
return n
end
a = 0
b = 1
i = 2
while i <= n
temp = b
b = a + b
a = temp
i = i + 1
end
return b
end

function main()
result = fibonacci(10)
print(result)
end


