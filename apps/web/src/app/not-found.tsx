import Link from 'next/link';
import { Button } from '@/components/ui/button';
export default function NotFound() {
  return <div className="flex min-h-dvh flex-col items-center justify-center gap-3 p-6 text-center"><div className="text-primary text-6xl font-bold">404</div><h1 className="text-xl font-semibold">Sahifa topilmadi</h1><p className="text-muted-foreground text-sm">Siz izlagan sahifa mavjud emas yoki ko‘chirilgan.</p><Button asChild><Link href="/dashboard">Bosh sahifaga</Link></Button></div>;
}
