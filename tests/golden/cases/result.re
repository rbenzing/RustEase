function main()
  success = ok(100)
  if success.is_ok()
    v = success.unwrap()
    print(v)
  end

  failure = err("oops")
  if failure.is_err()
    print("got error")
  end
end


