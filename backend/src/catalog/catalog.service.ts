import { ApiError } from '../http/api-error.ts';

export type AssetUnitStatus = 'available' | 'maintenance' | 'missing' | 'retired';

export interface EquipmentTypeRecord {
  id: string;
  name: string;
  description: string;
  hourlyRate: string | null;
  isActive: boolean;
  createdAt: Date;
}

export interface AssetUnitRecord {
  id: string;
  equipmentTypeId: string;
  equipmentTypeName: string;
  code: string;
  status: AssetUnitStatus;
  createdAt: Date;
}

export interface UnitFilters {
  equipmentTypeId?: string;
  status?: AssetUnitStatus;
}

export type UpdateAssetUnitStatusResult =
  | { kind: 'updated'; unit: AssetUnitRecord }
  | { kind: 'not_found' }
  | { kind: 'unit_in_custody' };

export interface CatalogRepository {
  listEquipmentTypes(activeOnly: boolean): Promise<EquipmentTypeRecord[]>;
  findEquipmentTypeById(id: string): Promise<EquipmentTypeRecord | null>;
  insertEquipmentType(input: Omit<EquipmentTypeRecord, 'id' | 'createdAt'>, createdAt: Date): Promise<EquipmentTypeRecord>;
  updateEquipmentType(id: string, changes: Partial<Omit<EquipmentTypeRecord, 'id' | 'createdAt'>>): Promise<EquipmentTypeRecord | null>;
  listAssetUnits(filters: UnitFilters): Promise<AssetUnitRecord[]>;
  findAssetUnitById(id: string): Promise<AssetUnitRecord | null>;
  insertAssetUnit(input: Omit<AssetUnitRecord, 'id' | 'equipmentTypeName' | 'createdAt'>, createdAt: Date): Promise<AssetUnitRecord>;
  updateAssetUnitStatus(id: string, status: AssetUnitStatus): Promise<UpdateAssetUnitStatusResult>;
}

const assetUnitStatuses = new Set<AssetUnitStatus>(['available', 'maintenance', 'missing', 'retired']);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ratePattern = /^\d{1,10}(?:\.\d{1,2})?$/;

function objectInput(value: unknown): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new ApiError(400, 'invalid_input', 'El cuerpo debe ser un objeto JSON.');
  }
  return value as Record<string, unknown>;
}

function assertAllowedKeys(input: Record<string, unknown>, allowed: string[]): void {
  if (Object.keys(input).some((key) => !allowed.includes(key))) {
    throw new ApiError(400, 'invalid_input', 'El cuerpo contiene campos no permitidos.');
  }
}

function requiredText(value: unknown, field: string, maxLength?: number): string {
  if (
    typeof value !== 'string'
    || value.trim().length === 0
    || (maxLength !== undefined && value.trim().length > maxLength)
  ) {
    const limitMessage = maxLength === undefined ? 'es obligatorio.' : `es obligatorio y no puede superar ${maxLength} caracteres.`;
    throw new ApiError(400, 'invalid_input', `${field} ${limitMessage}`);
  }
  return value.trim();
}

function parseRate(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || !ratePattern.test(value)) {
    throw new ApiError(400, 'invalid_input', 'hourlyRate debe ser un decimal no negativo con hasta dos decimales, o null.');
  }
  return value;
}

function parseActive(value: unknown): boolean {
  if (typeof value !== 'boolean') throw new ApiError(400, 'invalid_input', 'isActive debe ser booleano.');
  return value;
}

function parseStatus(value: unknown): AssetUnitStatus {
  if (typeof value !== 'string' || !assetUnitStatuses.has(value as AssetUnitStatus)) {
    throw new ApiError(400, 'invalid_input', 'status debe ser available, maintenance, missing o retired.');
  }
  return value as AssetUnitStatus;
}

function parseUuid(value: string, field: string): string {
  if (!uuidPattern.test(value)) throw new ApiError(400, 'invalid_input', `${field} debe ser un UUID válido.`);
  return value;
}

function mapDatabaseError(error: unknown): never {
  if (typeof error === 'object' && error !== null && 'code' in error) {
    const code = (error as { code?: unknown }).code;
    if (code === '23505') throw new ApiError(409, 'duplicate_code', 'Ya existe una unidad con ese código.');
    if (code === '23503') throw new ApiError(404, 'not_found', 'No se encontró el tipo de equipo solicitado.');
  }
  throw error;
}

export class CatalogService {
  private readonly repository: CatalogRepository;
  private readonly now: () => Date;

  constructor(
    repository: CatalogRepository,
    now: () => Date = () => new Date(),
  ) {
    this.repository = repository;
    this.now = now;
  }

  async getPublicEquipmentTypes(): Promise<Array<Pick<EquipmentTypeRecord, 'id' | 'name' | 'description' | 'hourlyRate'> & { isRentable: boolean }>> {
    const records = await this.repository.listEquipmentTypes(true);
    return records.map(({ id, name, description, hourlyRate, isActive }) => ({
      id,
      name,
      description,
      hourlyRate,
      isRentable: isActive && hourlyRate !== null,
    }));
  }

  getAdminEquipmentTypes(): Promise<EquipmentTypeRecord[]> {
    return this.repository.listEquipmentTypes(false);
  }

  async createEquipmentType(value: unknown): Promise<EquipmentTypeRecord> {
    const input = objectInput(value);
    assertAllowedKeys(input, ['name', 'description', 'hourlyRate', 'isActive']);
    const name = requiredText(input.name, 'name', 120);
    const description = requiredText(input.description, 'description');
    const hourlyRate = input.hourlyRate === undefined ? null : parseRate(input.hourlyRate);
    const isActive = input.isActive === undefined ? true : parseActive(input.isActive);
    try {
      return await this.repository.insertEquipmentType({ name, description, hourlyRate, isActive }, this.now());
    } catch (error) {
      return mapDatabaseError(error);
    }
  }

  async updateEquipmentType(id: string, value: unknown): Promise<EquipmentTypeRecord> {
    parseUuid(id, 'id');
    const input = objectInput(value);
    assertAllowedKeys(input, ['name', 'description', 'hourlyRate', 'isActive']);
    if (Object.keys(input).length === 0) throw new ApiError(400, 'invalid_input', 'Indica al menos un campo para actualizar.');

    const changes: Partial<Omit<EquipmentTypeRecord, 'id' | 'createdAt'>> = {};
    if ('name' in input) changes.name = requiredText(input.name, 'name', 120);
    if ('description' in input) changes.description = requiredText(input.description, 'description');
    if ('hourlyRate' in input) changes.hourlyRate = parseRate(input.hourlyRate);
    if ('isActive' in input) changes.isActive = parseActive(input.isActive);

    try {
      const updated = await this.repository.updateEquipmentType(id, changes);
      if (!updated) throw new ApiError(404, 'not_found', 'No se encontró el tipo de equipo solicitado.');
      return updated;
    } catch (error) {
      return mapDatabaseError(error);
    }
  }

  async requireRentableEquipmentType(id: string): Promise<EquipmentTypeRecord> {
    parseUuid(id, 'equipmentTypeId');
    const equipmentType = await this.repository.findEquipmentTypeById(id);
    if (!equipmentType) throw new ApiError(404, 'not_found', 'No se encontró el tipo de equipo solicitado.');
    if (!equipmentType.isActive || equipmentType.hourlyRate === null) {
      throw new ApiError(409, 'equipment_type_not_rentable', 'El tipo de equipo no está disponible para alquiler.');
    }
    return equipmentType;
  }

  async getAdminUnits(filters: UnitFilters): Promise<AssetUnitRecord[]> {
    if (filters.equipmentTypeId !== undefined) parseUuid(filters.equipmentTypeId, 'equipmentTypeId');
    if (filters.status !== undefined) parseStatus(filters.status);
    return this.repository.listAssetUnits(filters);
  }

  async createAssetUnit(value: unknown): Promise<AssetUnitRecord> {
    const input = objectInput(value);
    assertAllowedKeys(input, ['equipmentTypeId', 'code', 'status']);
    const equipmentTypeId = typeof input.equipmentTypeId === 'string'
      ? parseUuid(input.equipmentTypeId, 'equipmentTypeId')
      : (() => { throw new ApiError(400, 'invalid_input', 'equipmentTypeId debe ser un UUID válido.'); })();
    const code = requiredText(input.code, 'code', 80);
    const status = parseStatus(input.status);
    if (!(await this.repository.findEquipmentTypeById(equipmentTypeId))) {
      throw new ApiError(404, 'not_found', 'No se encontró el tipo de equipo solicitado.');
    }
    try {
      return await this.repository.insertAssetUnit({ equipmentTypeId, code, status }, this.now());
    } catch (error) {
      return mapDatabaseError(error);
    }
  }

  async updateAssetUnitStatus(id: string, value: unknown): Promise<AssetUnitRecord> {
    parseUuid(id, 'id');
    const input = objectInput(value);
    assertAllowedKeys(input, ['status']);
    if (Object.keys(input).length !== 1) throw new ApiError(400, 'invalid_input', 'Indica el nuevo status de la unidad.');
    const status = parseStatus(input.status);
    const result = await this.repository.updateAssetUnitStatus(id, status);
    if (result.kind === 'not_found') throw new ApiError(404, 'not_found', 'No se encontró la unidad solicitada.');
    if (result.kind === 'unit_in_custody') {
      throw new ApiError(409, 'unit_in_custody', 'No se puede cambiar el estado mientras la unidad esté en custodia física.');
    }
    return result.unit;
  }
}
