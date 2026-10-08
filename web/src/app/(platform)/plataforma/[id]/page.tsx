import { PlatformCompanyDetail } from '@/components/platform/company-detail';

export const metadata = { title: 'Empresa · Plataforma' };

export default async function PlatformCompanyPage(props: { params: Promise<{ id: string }> }) {
  const { id } = await props.params;
  return <PlatformCompanyDetail id={id} />;
}
