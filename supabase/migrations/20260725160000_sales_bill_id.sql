-- บิลชุด: หลายรายการบริการของลูกค้าคนเดียวผูกกันด้วย bill_id (ว่าง = บิลรายการเดียว)
alter table sales add column bill_id uuid;
create index sales_bill_id_idx on sales (bill_id) where bill_id is not null;
