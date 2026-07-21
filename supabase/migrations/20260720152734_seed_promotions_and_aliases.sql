insert into public.promotions (name, kind) values
  ('1 แถม 1',                'promotion'),
  ('60 แถม 30',              'promotion'),
  ('Happy Hours',            'promotion'),
  ('ลด 10%',                 'promotion'),
  ('ลด 15%',                 'promotion'),
  ('ผู้ติดตาม',              'promotion'),
  ('Gowabi',                 'channel'),
  ('KOL',                    'channel'),
  ('Member',                 'internal'),
  ('ถ่ายคอนเทนต์ / เทสนวด',  'internal')
on conflict (name) do nothing;

insert into public.promotion_aliases (raw_key, promotion_id, sample_text)
select v.raw_key, p.id, v.sample_text
from (values
  ('1แถม1',                 '1 แถม 1',               '1แถม1'),
  ('โปรโบวชัวร์1แถม1',      '1 แถม 1',               'โปรโบวชัวร์ 1 แถม1'),
  ('1แถม1(คูปอง)',          '1 แถม 1',               '1 แถม 1 (คูปอง)'),
  ('โบชัวร์1แถม1',          '1 แถม 1',               'โบชัวร์1แถม1'),
  ('1แถม1(โบรชัวร์)',       '1 แถม 1',               '1 แถม 1 (โบรชัวร์)'),
  ('60แถม30',               '60 แถม 30',             '60แถม30'),
  ('60แถม30member',         '60 แถม 30',             '60แถม30 member'),
  ('happyhours',            'Happy Hours',           'Happy Hours'),
  ('happyhour',             'Happy Hours',           'Happy Hour'),
  ('ลด10%',                 'ลด 10%',                'ลด10%'),
  ('ลด15%',                 'ลด 15%',                'ลด15%'),
  ('ส่วนลด15%',             'ลด 15%',                'ส่วนลด15%'),
  ('ผู้ติดตาม',             'ผู้ติดตาม',             'ผู้ติดตาม'),
  ('gowabi',                'Gowabi',                'Gowabi 517620293'),
  ('kol',                   'KOL',                   'KOL'),
  ('member',                'Member',                'Member'),
  ('memberพนง.พันธ์ุไทย',   'Member',                'Member พนง.พันธ์ุไทย'),
  ('memberไม่เอาพี่โจ',     'Member',                'Member ไม่เอาพี่โจ'),
  ('ซื้อslivermember',      'Member',                'ซื้อSliver member'),
  ('ซื้อgoldmember',        'Member',                'ซื้อGold Member'),
  ('เคสถ่ายรีวิว',          'ถ่ายคอนเทนต์ / เทสนวด', 'เคสถ่ายรีวิว'),
  ('testก่อนถ่ายทำ',        'ถ่ายคอนเทนต์ / เทสนวด', 'test ก่อนถ่ายทำ'),
  ('ถ่ายคอนเทน',            'ถ่ายคอนเทนต์ / เทสนวด', 'ถ่ายคอนเทน'),
  ('content',               'ถ่ายคอนเทนต์ / เทสนวด', 'content'),
  ('เทสนวดรีเซฟชั่น',       'ถ่ายคอนเทนต์ / เทสนวด', 'เทสนวดรีเซฟชั่น'),
  ('เทสนวดหัว60นาที',       'ถ่ายคอนเทนต์ / เทสนวด', 'เทสนวดหัว 60นาที'),
  ('test',                  'ถ่ายคอนเทนต์ / เทสนวด', 'test'),
  ('ถ่ายคอนเทนต์/เทสนวด',   'ถ่ายคอนเทนต์ / เทสนวด', 'ถ่ายคอนเทนต์ / เทสนวด')
) as v(raw_key, promo_name, sample_text)
join public.promotions p on p.name = v.promo_name
on conflict (raw_key) do nothing;
