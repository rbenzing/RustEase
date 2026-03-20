function main()
  maybe = some(42)
  if maybe.is_some()
    val = maybe.unwrap()
    print(val)
  end

  empty = none
  fallback = empty.unwrap_or(0)
  print(fallback)
end


