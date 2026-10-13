-- Closing a customer's open forms when they order.
CREATE INDEX "Cart_phone_status_idx" ON "Cart"("phone", "status");
