import { Router, type Request } from 'express';
import type { AuthDatabase } from '../auth/auth.types.ts';
import { requireAuth, requireRole } from '../auth/auth.middleware.ts';
import { ApiError } from '../http/api-error.ts';
import { CatalogService, type AssetUnitStatus } from './catalog.service.ts';
import { PostgresCatalogRepository } from './catalog.repository.ts';

function queryText(request: Request, key: string): string | undefined {
  const value = request.query[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'string') throw new ApiError(400, 'invalid_input', `${key} debe aparecer una sola vez.`);
  return value;
}

export function createCatalogRouter(
  database: AuthDatabase,
  accessTokenSecret: string,
  now: () => Date = () => new Date(),
): Router {
  const router = Router();
  const service = new CatalogService(new PostgresCatalogRepository(database), now);
  const admin = Router();

  router.get('/equipment-types', async (_request, response) => {
    response.status(200).json(await service.getPublicEquipmentTypes());
  });

  admin.use(requireAuth(database, accessTokenSecret, now), requireRole('admin'));
  admin.get('/equipment-types', async (_request, response) => {
    response.status(200).json(await service.getAdminEquipmentTypes());
  });
  admin.post('/equipment-types', async (request, response) => {
    response.status(201).json(await service.createEquipmentType(request.body));
  });
  admin.patch('/equipment-types/:id', async (request, response) => {
    const id = Array.isArray(request.params.id) ? request.params.id[0]! : request.params.id!;
    response.status(200).json(await service.updateEquipmentType(id, request.body));
  });
  admin.get('/units', async (request, response) => {
    const equipmentTypeId = queryText(request, 'equipmentTypeId');
    const statusText = queryText(request, 'status');
    const filters: { equipmentTypeId?: string; status?: AssetUnitStatus } = {};
    if (equipmentTypeId !== undefined) filters.equipmentTypeId = equipmentTypeId;
    if (statusText !== undefined) filters.status = statusText as AssetUnitStatus;
    response.status(200).json(await service.getAdminUnits(filters));
  });
  admin.post('/units', async (request, response) => {
    response.status(201).json(await service.createAssetUnit(request.body));
  });
  admin.patch('/units/:id', async (request, response) => {
    const id = Array.isArray(request.params.id) ? request.params.id[0]! : request.params.id!;
    response.status(200).json(await service.updateAssetUnitStatus(id, request.body));
  });

  router.use('/admin', admin);
  return router;
}
