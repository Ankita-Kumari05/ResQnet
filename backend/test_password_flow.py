import httpx

# 1. Forgot password test
r1 = httpx.post("http://127.0.0.1:8000/api/v1/auth/forgot-password", json={"identifier": "citizen1@resqnet.in"})
print("Forgot password status:", r1.status_code)
print("Forgot password response:", r1.json())
token = r1.json().get("reset_token")

# 2. Reset password test
r2 = httpx.post("http://127.0.0.1:8000/api/v1/auth/reset-password", json={
    "email": "citizen1@resqnet.in",
    "new_password": "newSecurePassword123!",
    "token": token
})
print("Reset password status:", r2.status_code)
print("Reset password response:", r2.json())

# 3. Verify sign in with new password
r3 = httpx.post("http://127.0.0.1:8000/api/v1/auth/login", json={
    "email": "citizen1@resqnet.in",
    "password": "newSecurePassword123!"
})
print("Login with new password status:", r3.status_code)
print("Login success user:", r3.json().get("user", {}).get("email"))

# Reset it back to citizen123 so demo button still works cleanly
r4 = httpx.post("http://127.0.0.1:8000/api/v1/auth/reset-password", json={
    "email": "citizen1@resqnet.in",
    "new_password": "citizen123"
})
print("Restored original password:", r4.status_code)
