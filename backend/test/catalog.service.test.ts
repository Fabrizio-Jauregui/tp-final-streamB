import { describe, expect, it, vi } from 'vitest';
import { CatalogService, type CatalogRepository, type EquipmentTypeRecord } from '../src/catalog/catalog.service.ts';

const typeId = '86ab6428-f20a-46fa-aefb-4a97ebcaf10b';

function setup(record: EquipmentTypeRecord | null): CatalogService {
  const repository = {
    findEquipmentTypeById: vi.fn().mockResolvedValue(record),
  } as unknown as CatalogRepository;
  return new CatalogService(repository);
}

describe('catalog rental eligibility', () => {
  it('returns an active equipment type with its current tariff', async () => {
    const equipmentType = {
      id: typeId,
      name: 'Cámara',
      description: 'Cámara de video',
      hourlyRate: '1200.00',
      isActive: true,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    };
    await expect(setup(equipmentType).requireRentableEquipmentType(typeId)).resolves.toEqual(equipmentType);
  });

  it('rejects an inactive type or a type without tariff for rental', async () => {
    await expect(setup({
      id: typeId, name: 'Archivada', description: 'Fuera de catálogo', hourlyRate: '100.00', isActive: false,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    }).requireRentableEquipmentType(typeId)).rejects.toMatchObject({ status: 409 });

    await expect(setup({
      id: typeId, name: 'Sin tarifa', description: 'Pendiente', hourlyRate: null, isActive: true,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    }).requireRentableEquipmentType(typeId)).rejects.toMatchObject({ status: 409 });
  });

  it('reports a missing type as not found', async () => {
    await expect(setup(null).requireRentableEquipmentType(typeId)).rejects.toMatchObject({ status: 404 });
  });
});
