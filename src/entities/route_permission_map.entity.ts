import { Entity, Unique, PrimaryGeneratedColumn, Column, ManyToMany, JoinTable, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { Route_permission_definition } from './route_permission_definition.entity';
import { Route_definition } from './route_definition.entity';
import { Setting_definition } from './setting_definition.entity';

@Entity('route_permission_map')
@Unique(['action', 'method'])
export class Route_permission_map {
    @PrimaryGeneratedColumn('increment')
    id: number;
    @Column({ type: "varchar", nullable: false })
    action: string;
    @Column({ type: "varchar", nullable: false })
    method: string;
    @ManyToMany('Route_permission_definition', (rel: any) => rel.actions, { nullable: true, cascade: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinTable()
    route_permissions: any;
    @ManyToMany('Route_definition', (rel: any) => rel.publishedMethods, { nullable: true, cascade: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinTable()
    routes: any;
    @ManyToOne('Setting_definition', (rel: any) => rel.actionPermissionValue, { nullable: true, onDelete: 'CASCADE', onUpdate: 'CASCADE' })
    @JoinColumn()
    setting: any;
    @CreateDateColumn()
    createdAt: Date;
    @UpdateDateColumn()
    updatedAt: Date;
}
