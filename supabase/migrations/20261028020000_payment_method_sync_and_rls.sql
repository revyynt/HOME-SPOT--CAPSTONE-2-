-- Sync specific PayMongo payment methods between app_documents and public.payments
create or replace function public.format_paymongo_method(raw_method text)
returns text language plpgsql immutable as $$
declare
  lower_val text := lower(trim(coalesce(raw_method, '')));
begin
  if lower_val = '' then
    return 'PayMongo Checkout';
  end if;
  if lower_val like 'paymongo checkout (%)' then
    return 'PayMongo Checkout' || substring(trim(raw_method) from 18);
  end if;
  if lower_val like '%gcash%' then
    return 'PayMongo Checkout (GCash)';
  end if;
  if lower_val like '%maya%' then
    return 'PayMongo Checkout (Maya)';
  end if;
  if lower_val like '%qrph%' or lower_val like '%qr ph%' or lower_val like '%qr_ph%' then
    return 'PayMongo Checkout (QR Ph)';
  end if;
  if lower_val like '%grab%' then
    return 'PayMongo Checkout (GrabPay)';
  end if;
  if lower_val like '%card%' or lower_val like '%3ds%' or lower_val like '%visa%' or lower_val like '%mastercard%' then
    return 'PayMongo Checkout (Card)';
  end if;
  if lower_val in ('paymongo', 'paymongo checkout') then
    return 'PayMongo Checkout';
  end if;
  return trim(raw_method);
end;
$$;
