import { describe,it,expect } from 'vitest';
import { primaryVehicleType,matchesVehicleType,vehicleType } from './vehicleTypes';
const car=(name:string,body_category:string,is_convertible=false)=>({name,body_category,is_convertible});
describe('Hero vehicle type rules',()=>{
 it.each(['Ford New Mustang','Nissan 370Z'])('%s is Sports and Convertible',name=>{expect(matchesVehicleType(car(name,'sports'),'sports')).toBe(true);expect(matchesVehicleType(car(name,'sports'),'convertible')).toBe(true)});
 it('unproven closed sports car is not convertible',()=>expect(matchesVehicleType(car('Dodge Challenger GT','sports'),'convertible')).toBe(false));
 it('existing verified convertible tag is respected',()=>expect(matchesVehicleType(car('BMW M440','sports',true),'convertible')).toBe(true));
 it.each(['Chrysler Pacifica','Kia Carnival'])('%s maps to Minivan not SUV',name=>{expect(primaryVehicleType(car(name,'suv'))).toBe('minivan');expect(matchesVehicleType(car(name,'suv'),'suv')).toBe(false)});
 it('Luxury Escalade maps to physical SUV',()=>expect(primaryVehicleType(car('Cadillac Escalade','luxury'))).toBe('suv'));
 it('BMW 740 maps to Sedan',()=>expect(primaryVehicleType(car('BMW 740','luxury'))).toBe('sedan'));
 it('pickup stays unclassified but is retained in Todos',()=>{expect(primaryVehicleType(car('Dodge Ram 2500','luxury'))).toBeNull();expect(matchesVehicleType(car('Dodge Ram 2500','luxury'),'all')).toBe(true)});
 it('Exotic SUV merchandising classification stays Exotic',()=>expect(primaryVehicleType(car('Lamborghini Urus','exotics'))).toBe('exotics'));
 it('unknown URL type defaults to all',()=>expect(vehicleType('unknown')).toBe('all'));
});
